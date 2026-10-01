const { minify } = require("html-minifier-terser");
const fs = require("fs");
const path = require("path");

const srcDir = "./";
const outDir = "./dist";

const excludeDirs = ["node_modules", "dist", ".vercel", ".git", "v2", "api", "services"];
const excludeFiles = ["login_copy.html", "signup_copy.html", "otp_copy.html"];

const minifyOptions = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  minifyJS: true,
  minifyCSS: true,
};

function getAllFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        getAllFiles(fullPath, fileList);
      }
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

async function build() {
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
  fs.mkdirSync(outDir);

  const allFiles = getAllFiles(srcDir);

  for (const filePath of allFiles) {
    const relativePath = path.relative(srcDir, filePath);
    const destPath = path.join(outDir, relativePath);
    const fileName = path.basename(filePath);

    // if (excludeFiles.includes(fileName)) {
    //   console.log(`⏭  Skipped: ${relativePath}`);
    //   continue;
    // }

    if (path.extname(filePath) === ".html") {
  const html = fs.readFileSync(filePath, "utf8");
  try {
    const minified = await minify(html, minifyOptions);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, minified);
    const saved = (((html.length - minified.length) / html.length) * 100).toFixed(1);
    console.log(`✓ ${relativePath} — ${saved}% smaller`);
  } catch (err) {
    console.error(`✗ Failed to minify: ${relativePath}`);
    console.error(`  → ${err.message}`);
    copyFile(filePath, destPath);
    console.log(`  → Copied original as fallback`);
  }

} else if (path.extname(filePath) === ".js") {
  const js = fs.readFileSync(filePath, "utf8");
  try {
    const { minify: minifyJS } = require("terser");
    const result = await minifyJS(js, { mangle: true, compress: true });
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, result.code);
    const saved = (((js.length - result.code.length) / js.length) * 100).toFixed(1);
    console.log(`✓ ${relativePath} — ${saved}% smaller`);
  } catch (err) {
    console.error(`✗ Failed to minify: ${relativePath}`);
    console.error(`  → ${err.message}`);
    copyFile(filePath, destPath);
    console.log(`  → Copied original as fallback`);
  }

} else if (path.extname(filePath) === ".css") {
  const css = fs.readFileSync(filePath, "utf8");
  try {
    const CleanCSS = require("clean-css");
    const result = new CleanCSS({ level: 2 }).minify(css);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, result.styles);
    const saved = (((css.length - result.styles.length) / css.length) * 100).toFixed(1);
    console.log(`✓ ${relativePath} — ${saved}% smaller`);
  } catch (err) {
    console.error(`✗ Failed to minify: ${relativePath}`);
    console.error(`  → ${err.message}`);
    copyFile(filePath, destPath);
    console.log(`  → Copied original as fallback`);
  }

} else {
  // Copy everything else as-is (images, fonts, json, etc.)
  copyFile(filePath, destPath);
  console.log(`✓ Copied: ${relativePath}`);
}
  }

  console.log("\n✅ Build complete → /dist");
}

// comment out for production
// if (process.env.VERCEL_ENV !== "production") {
//     fs.writeFileSync("vercel.json", JSON.stringify({
//         buildCommand: "npm run build",
//         outputDirectory: "./"
//     }, null, 2));
//   console.log("⏭  Skipping build — not production");
//   process.exit(0);
// }

// create vercel.json for prod
fs.writeFileSync("vercel.json", JSON.stringify({
  buildCommand: "npm run build",
  outputDirectory: "dist",
  functions: {
    "api/cron.js": {
      includeFiles: "templates/**"
    }
  },
  crons: [
    {
      path: "/api/cron?org=67ce047c-99d4-40c1-a0a4-691ce4046852",
      schedule: "0 2 * * *"
    }
  ]
}, null, 2));

build().catch(console.error);