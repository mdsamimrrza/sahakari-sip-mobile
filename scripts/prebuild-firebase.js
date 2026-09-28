const fs = require("fs");
const b64 = process.env.GOOGLE_SERVICES_JSON_B64;
if (b64) {
  const dir = "android/app";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + "/google-services.json", Buffer.from(b64, "base64"));
  console.log("google-services.json created from env");
} else {
  console.warn("GOOGLE_SERVICES_JSON_B64 not set - google-services.json must exist locally");
}
