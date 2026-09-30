// hangram-biometric — binds a secret to Touch ID using a Secure Enclave key.
//
// The vault master key is encrypted (ECIES: P-256 ECDH + HKDF-SHA256 + AES-GCM) to a
// key pair whose private half lives in the Secure Enclave and is created with the
// `.biometryCurrentSet` access control. Decryption therefore requires the enclave to
// see a successful biometric match — it is enforced by hardware, not by an `if` in
// this process. Re-enrolling fingerprints invalidates the key.
//
// Protocol: one JSON object on stdin, one JSON object on stdout.
//   {"op":"available"}                       -> {"ok":true,"available":Bool}
//   {"op":"wrap","secret":b64}               -> {"ok":true,"key":b64,"eph":b64,"box":b64}
//   {"op":"unwrap","key","eph","box","reason"} -> {"ok":true,"secret":b64}
//   {"op":"quit","pid":Int}                  -> {"ok":true,"sent":Bool}   (polite Cmd+Q for a pid)
// Failures: {"ok":false,"error":"...", "cancelled":Bool}

import AppKit
import CryptoKit
import Foundation
import LocalAuthentication

struct Request: Decodable {
    let op: String
    let secret: String?
    let key: String?
    let eph: String?
    let box: String?
    let reason: String?
    let pid: Int32?
}

func reply(_ object: [String: Any]) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: object)
    FileHandle.standardOutput.write(data)
    exit(0)
}

func fail(_ message: String, cancelled: Bool = false) -> Never {
    reply(["ok": false, "error": message, "cancelled": cancelled])
}

func b64(_ value: String?) -> Data {
    guard let value, let data = Data(base64Encoded: value) else { fail("bad input") }
    return data
}

func symmetricKey(_ shared: SharedSecret, eph: Data) -> SymmetricKey {
    shared.hkdfDerivedSymmetricKey(
        using: SHA256.self,
        salt: eph,
        sharedInfo: Data("hangram:biometric:v1".utf8),
        outputByteCount: 32
    )
}

func biometryAvailable() -> Bool {
    var error: NSError?
    return SecureEnclave.isAvailable
        && LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
}

let input = FileHandle.standardInput.readDataToEndOfFile()
guard let request = try? JSONDecoder().decode(Request.self, from: input) else { fail("bad request") }

switch request.op {
case "available":
    reply(["ok": true, "available": biometryAvailable()])

case "wrap":
    guard biometryAvailable() else { fail("Touch ID is not available") }
    let secret = b64(request.secret)
    var cfError: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
        nil,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        &cfError
    ) else { fail("access control: \(String(describing: cfError?.takeRetainedValue()))") }
    do {
        let enclaveKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: access)
        let ephemeral = P256.KeyAgreement.PrivateKey()
        let eph = ephemeral.publicKey.x963Representation
        let shared = try ephemeral.sharedSecretFromKeyAgreement(with: enclaveKey.publicKey)
        let box = try AES.GCM.seal(secret, using: symmetricKey(shared, eph: eph))
        reply([
            "ok": true,
            "key": enclaveKey.dataRepresentation.base64EncodedString(),
            "eph": eph.base64EncodedString(),
            "box": box.combined!.base64EncodedString(),
        ])
    } catch {
        fail("\(error)")
    }

case "unwrap":
    let context = LAContext()
    context.localizedReason = request.reason ?? "unlock the vault"
    do {
        let enclaveKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(
            dataRepresentation: b64(request.key),
            authenticationContext: context
        )
        let eph = b64(request.eph)
        let ephemeral = try P256.KeyAgreement.PublicKey(x963Representation: eph)
        // The enclave prompts for Touch ID here.
        let shared = try enclaveKey.sharedSecretFromKeyAgreement(with: ephemeral)
        let box = try AES.GCM.SealedBox(combined: b64(request.box))
        let secret = try AES.GCM.open(box, using: symmetricKey(shared, eph: eph))
        reply(["ok": true, "secret": secret.base64EncodedString()])
    } catch let error as LAError {
        let cancelled = [.userCancel, .appCancel, .systemCancel].contains(error.code)
        fail(error.localizedDescription, cancelled: cancelled)
    } catch {
        let ns = error as NSError
        let cancelled = ns.domain == LAErrorDomain && [-2, -4, -9].contains(ns.code)
        fail(ns.localizedDescription, cancelled: cancelled)
    }

case "quit":
    // Same as the user choosing Quit: lets Telegram flush its local storage.
    guard let pid = request.pid, let app = NSRunningApplication(processIdentifier: pid) else {
        reply(["ok": true, "sent": false])
    }
    reply(["ok": true, "sent": app.terminate()])

default:
    fail("unknown op")
}
