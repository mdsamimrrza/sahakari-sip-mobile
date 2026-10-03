const fs = require("fs");

const target = "android/app/google-services.json";
const b64 = process.env.GOOGLE_SERVICES_JSON_B64;

if (b64) {
  fs.mkdirSync("android/app", { recursive: true });
  fs.writeFileSync(target, Buffer.from(b64, "base64"));
  console.log("google-services.json created from env");
} else if (!fs.existsSync(target)) {
  // Fail fast here instead of 4 minutes into Gradle with
  // "File google-services.json is missing".
  console.error(
    "FATAL: google-services.json not found and GOOGLE_SERVICES_JSON_B64 not set.\n" +
      "Either keep android/app/google-services.json in the uploaded project\n" +
      "(must not be listed in .easignore) or set GOOGLE_SERVICES_JSON_B64."
  );
  process.exit(1);
} else {
  console.log("google-services.json already present");
}
