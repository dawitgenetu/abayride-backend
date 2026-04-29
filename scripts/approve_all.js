require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.log("Missing env variables");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Approving all drivers...");
  const { data, error } = await supabaseAdmin
    .from("drivers")
    .update({ is_approved: true })
    .neq("is_approved", true);
  
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Successfully approved all drivers.");
  }
}

run();
