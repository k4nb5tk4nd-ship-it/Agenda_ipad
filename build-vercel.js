var fs = require("fs");
var path = require("path");

var root = __dirname;
var output = path.join(root, "dist");
var files = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "service-worker.js"
];

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  var entries = fs.readdirSync(source, { withFileTypes: true });

  entries.forEach(function (entry) {
    var sourcePath = path.join(source, entry.name);
    var destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  });
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

files.forEach(function (file) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
});

copyDirectory(path.join(root, "icons"), path.join(output, "icons"));
console.log("Agenda preparada a dist/");
