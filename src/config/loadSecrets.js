import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// Every secret the app needs at runtime. Names must match the secret
// names created in Google Secret Manager (see create-secrets.sh).
const SECRET_NAMES = [
  "JWT_SECRET",
  "EMAIL_USER",
  "EMAIL_PASS",
  "MONGO_URI",
  "GOOGLE_SPREAD_SHEET_ID",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_CLIENT_EMAIL",
];

/**
 * In production (App Engine), load all secrets from Google Secret Manager
 * into process.env. Locally (NODE_ENV !== "production") this is a no-op and
 * the values come from a local .env file via dotenv.
 *
 * Must be called BEFORE importing app.js / cron.controller.js, because some
 * modules (mailer transporter, Google auth) read process.env at import time.
 */
export const loadSecrets = async () => {
  if (process.env.NODE_ENV !== "production") {
    return; // local dev uses .env
  }

  // GOOGLE_CLOUD_PROJECT is set automatically by the App Engine runtime.
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    throw new Error(
      "loadSecrets: GOOGLE_CLOUD_PROJECT is not set — cannot resolve secrets."
    );
  }

  const client = new SecretManagerServiceClient();

  const accessSecret = async (name) => {
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });
    return version.payload.data.toString("utf8");
  };

  await Promise.all(
    SECRET_NAMES.map(async (name) => {
      process.env[name] = await accessSecret(name);
    })
  );

  console.log("✅ Loaded secrets from Google Secret Manager");
};
