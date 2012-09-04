var fs = require("fs");
var rmrf = require("rimraf");
var yaml = require("js-yaml");
var marked = require("marked");
var Mold = require("mold/mold.node");
var util = require("./util");

function hasFrontMatter(file) {
  var fd = fs.openSync(file, "r");
  var b = new Buffer(4);
  var ret = fs.readSync(fd, b, 0, 4, 0) == 4 && b.toString() == "---\n";
  fs.closeSync(fd);
  return ret;
}

function readFrontMatter(file) {
  if (/^---\n/.test(file)) {
    var end = file.search(/\n---\n/);
    if (end != -1) return {front: yaml.load(file.slice(4, end + 1)), main: file.slice(end + 5)};
  }
  return {front: {}, main: file};
}

function readPosts(config) {
  var posts = [];
  fs.readdirSync("_posts/").forEach(function(file) {
    var d = file.match(/^(\d{4})-(\d\d?)-(\d\d?)-(.+)\.md$/);
    if (!d) return;
    var split = readFrontMatter(fs.readFileSync("_posts/" + file, "utf8"));
    var post = split.front;
    post.date = new Date(d[1], d[2], d[3]);
    post.content = marked(split.main);
    post.name = d[4];
    post.url = getURL(config, post);
    posts.push(post);
  });
  return posts;
}

function gatherTags(posts) {
  var tags = {};
  posts.forEach(function(post) {
    if (post.tags) post.tags.forEach(function(tag) {
      (tags.hasOwnProperty(tag) ? tags[tag] : (tags[tag] = [])).push(post);
    });
  });
  return tags;
}

var defaults = {
  postLink: "${name}.html"
};

function readConfig() {
  var config = util.exists("_config.yml") ? yaml.load(fs.readFileSync("_config.yml", "utf8")) : {};
  for (var opt in defaults) if (defaults.hasOwnProperty(opt) && !config.hasOwnProperty(opt))
    config[opt] = defaults[opt];
  return config;
}

function getURL(config, post) {
  var link = config.postLink;
  for (var prop in post) link = link.replace("${" + prop + "}", post[prop]);
  return link;
}

function ensureDirectories(path) {
  var parts = path.split("/"), cur = "";
  for (var i = 0; i < parts.length - 1; ++i) {
    cur += parts[i] + "/";
    if (!util.exists(cur, true)) fs.mkdirSync(cur);
  }
}

function prepareIncludes() {
  if (!util.exists("_includes/", true)) return;
  fs.readdirSync("_includes/").forEach(function(file) {
    Mold.define(file.match(/^(.*?)\.[^\.]+$/)[1], Mold.bake(fs.readFileSync("_includes/" + file, "utf8")));
  });
}

var layouts = {};
function getLayout(name) {
  if (layouts.hasOwnProperty(name)) return layouts[name];
  var tmpl = Mold.bake(fs.readFileSync("_layouts/" + name + ".html", "utf8"));
  layouts[name] = tmpl;
  return tmpl;
}

// Global for global access from templates
var site;

function generate() {
  var config = readConfig(), posts = readPosts(config), tags = gatherTags(posts);
  prepareIncludes();
  site = {posts: posts, tags: tags, config: config};
  if (util.exists("_site", true)) rmrf.sync("_site");
  posts.forEach(function(post) {
    var path = "_site/" + post.url;
    ensureDirectories(path);
    fs.writeFileSync(path, getLayout(post.layout || "post.html")(post), "utf8");
  });
  function walkDir(dir) {
    fs.readdirSync(dir).forEach(function(fname) {
      if (fname.charAt(0) == "_") return;
      var file = dir + fname;
      if (fs.statSync(file).isDirectory()) {
        walkDir(file + "/");
      } else {
        var out = "_site/" + file;
        ensureDirectories(out)
        if (/\.md$/.test(fname) && hasFrontMatter(file)) {
          var split = readFrontMatter(fs.readFileSync(file, "utf8"));
          var doc = split.front;
          doc.content = marked(split.main);
          doc.name = fname.match(/^(.*?)\.[^\.]+$/)[1];
          doc.url = file;
          fs.writeFileSync(out, getLayout(doc.layout || "default.html")(doc), "utf8");
        } else {
          util.copyFileSync(file, out);
        }
      }
    });
  }
  walkDir("./");
}

generate();
