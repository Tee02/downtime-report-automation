// Runs before migrations on Vercel. Explains what is wrong with DATABASE_URL
// without printing the value (it holds the database password).
const raw = process.env.DATABASE_URL;

function fail(message) {
  console.error(`\n[DATABASE_URL check] ${message}\n`);
  process.exit(1);
}

if (!raw) fail("DATABASE_URL is not set for this environment (Production or Preview).");

const value = raw.trim();
if (value !== raw) console.warn("[DATABASE_URL check] Value has leading/trailing spaces or line breaks; remove them.");
if (/^["']|["']$/.test(value)) fail("Value is wrapped in quotes. Remove the quotes.");
if (/\s/.test(value)) fail("Value contains spaces or line breaks. It must be one line with no spaces.");
if (value.startsWith("mysql ") || value.includes(" -u ") || value.includes("--")) fail("Value looks like a mysql command, not a URL. Use mysql://USER:PASSWORD@HOST:4000/downtime?ssl={\"rejectUnauthorized\":true}");
if (!value.startsWith("mysql://")) fail(`Value must start with mysql:// (it starts with "${value.slice(0, 4).replace(/[^a-z?:/]/gi, "*")}...").`);
if (/[<>]/.test(value)) fail("Value still contains < > placeholders such as <PASSWORD>. Replace them with the real values.");

const atCount = (value.match(/@/g) || []).length;
if (atCount !== 1) fail(`Value contains ${atCount} "@" characters; it needs exactly one. The password probably contains @ — reset it to letters and numbers only.`);

let url;
try {
  url = new URL(value);
} catch {
  fail("Value is not a valid URL. The password probably contains : / # ? or % — reset it to letters and numbers only.");
}

if (!url.username) fail("Username is missing (expected mysql://USERNAME:PASSWORD@...).");
if (!url.password) fail("Password is missing (expected mysql://USERNAME:PASSWORD@...).");
if (!url.hostname) fail("Host is missing.");
if (!url.pathname || url.pathname === "/") fail("Database name is missing. Add /downtime before the ?ssl= part.");
if (url.hostname.includes("tidbcloud.com") && !url.searchParams.get("ssl")) fail('TiDB Cloud needs SSL. Add ?ssl={"rejectUnauthorized":true} to the end.');

console.log(`[DATABASE_URL check] OK — host ${url.hostname}, port ${url.port || "3306"}, database ${url.pathname.slice(1)}.`);
