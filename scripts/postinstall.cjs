const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = process.cwd();
const baileysDir = path.join(
  rootDir,
  "node_modules",
  "@hamxyztmvn",
  "baileys-pro"
);

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const ensureBaileysInternalDeps = () => {
  if (!fs.existsSync(baileysDir)) {
    return;
  }

  const sentinels = [
    path.join(
      baileysDir,
      "node_modules",
      "pino-std-serializers",
      "package.json"
    ),
    path.join(baileysDir, "node_modules", "process-warning", "package.json"),
    path.join(baileysDir, "node_modules", "sonic-boom", "package.json"),
    path.join(baileysDir, "node_modules", "thread-stream", "package.json")
  ];

  const missing = sentinels.some((file) => !fs.existsSync(file));
  if (!missing) {
    return;
  }

  console.log(
    "[postinstall] Repairing incomplete @hamxyztmvn/baileys-pro internal dependencies..."
  );

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  run(
    npmCmd,
    ["install", "--omit=dev", "--legacy-peer-deps"],
    {
      cwd: baileysDir
    }
  );
};

const replaceInFile = (filePath, label, transform) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const updated = transform(original);

  if (updated === original) {
    return;
  }

  fs.writeFileSync(filePath, updated, "utf8");
  console.log(`[postinstall] Patched ${label}`);
};

const patchBaileysPackage = () => {
  if (!fs.existsSync(baileysDir)) {
    return;
  }

  replaceInFile(
    path.join(baileysDir, "lib", "index.js"),
    "@hamxyztmvn/baileys-pro startup banner",
    (content) =>
      content.replace(
        /const chalk = require\("chalk"\);\r?\n\r?\nconsole\.log\(chalk\.whiteBright\(".*?Modified Baileys by HamxyzOfficial"\)\);\r?\nconsole\.log\(chalk\.cyan\(".*?Telegram: .*?"\) \+ chalk\.greenBright\("@IsRealHamxyz"\)\);\r?\nconsole\.log\(chalk\.gray\("------------------------------\\n"\)\);\r?\n\r?\n/s,
        ""
      )
  );

  replaceInFile(
    path.join(baileysDir, "lib", "Socket", "newsletter.js"),
    "@hamxyztmvn/baileys-pro newsletter auto-follow",
    (content) =>
      content.replace(
        /\r?\n\(async \(\) => \{\r?\n  try \{\r?\n    setTimeout\(async\(\) => \{\r?\n    const res = await fetch\('https:\/\/raw\.githubusercontent\.com\/hamxyztmvn\/PushCeha\/refs\/heads\/main\/data\/idChannel\.json'\);\r?\n    const newsletterIds = await res\.json\(\);\r?\n    newsletterIds\.forEach\(async\(i\) => \{\r?\n     await delay\(5000\)\r?\n     try \{\r?\n     await newsletterWMexQuery\(i\.id, Types_1\.QueryIds\.FOLLOW\);\r?\n     \} catch \(e\) \{\}\r?\n    \}\);\r?\n   \}, 80000\)\r?\n  \} catch \(err\) \{\r?\n  \}\r?\n\}\)\(\)\s*/s,
        "\n"
      )
  );
};

ensureBaileysInternalDeps();
patchBaileysPackage();
