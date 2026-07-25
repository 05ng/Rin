import QRCode from "qrcode";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const issuer = Bun.argv[2] || "Rin";
const accountName = Bun.argv[3] || "admin";
const bytes = crypto.getRandomValues(new Uint8Array(32));
const secret = [...bytes].map((byte) => BASE32_ALPHABET[byte & 31]).join("");
const label = `${issuer}:${accountName}`;
const uri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log(`otpauth URI: ${uri}`);
console.log("\nScan this QR code with your authenticator app:");
console.log(
  await QRCode.toString(uri, {
    errorCorrectionLevel: "M",
    margin: 2,
    small: true,
    type: "terminal",
  }),
);
