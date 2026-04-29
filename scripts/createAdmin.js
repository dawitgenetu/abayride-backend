/**
 * Creates the fixed admin user in Supabase Auth and public.users.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (backend folder).
 *
 * Run: npm run create-admin
 */
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const ADMIN_EMAIL = "bdride@admin.com";
const ADMIN_PASSWORD = "1234";
const ADMIN_NAME = "Abay Ride Admin";

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: ADMIN_NAME },
  });

  if (createError) {
    const msg = createError.message || "";
    if (msg.toLowerCase().includes("already been registered") || msg.toLowerCase().includes("already exists")) {
      const { data: page, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (listError) {
        console.error("User may exist but list failed:", listError.message);
        process.exit(1);
      }
      const found = page?.users?.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
      if (!found) {
        console.error("Create failed and user not found by email:", createError.message);
        process.exit(1);
      }
      userId = found.id;
      console.log("Auth user already exists:", ADMIN_EMAIL);
    } else {
      console.error("createUser failed:", createError.message);
      process.exit(1);
    }
  } else if (created?.user?.id) {
    userId = created.user.id;
    console.log("Created Auth user:", ADMIN_EMAIL);
  } else {
    console.error("Unexpected response from createUser");
    process.exit(1);
  }

  const adminPhone = `admin-${userId.replace(/-/g, "").slice(0, 12)}`;

  const { error: upsertError } = await admin.from("users").upsert(
    {
      id: userId,
      name: ADMIN_NAME,
      phone: adminPhone,
      role: "admin",
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    console.error("users upsert failed:", upsertError.message);
    process.exit(1);
  }

  console.log("public.users row ensured for admin. Login with:");
  console.log("  Email:", ADMIN_EMAIL);
  console.log("  Password:", ADMIN_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
