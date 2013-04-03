'use strict';

var async = require('async');
var fs = require('fs');
var Handlebars = require('handlebars');
var inflection = require('inflection');
var mkdirp = require('mkdirp');
var sysPath = require('path');
var logger = require('loggy');

exports.formatTemplate = function(template, templateData) {
  var key = '__TEMPLATE_FORMATTER';
  var compiled = Handlebars.compile(template.replace(/\\\{/, key));
  return compiled(templateData).toString().replace(key, '\\');
};

Handlebars.registerHelper('camelize', (function() {
  var camelize = function(string) {
    var regexp = /[-_]([a-z])/g;
    var rest = string.replace(regexp, function(match, char) {
      return char.toUpperCase();
    });
    return rest[0].toUpperCase() + rest.slice(1);
  };
  return function(options) {
    return new Handlebars.SafeString(camelize(options.fn(this)));
  };
})());

exports.generateFile = function(path, data, method, callback) {
  fs.exists(path, function(exists) {
    if (exists && method !== 'overwrite' && method !== 'append') {
      logger.info("skipping " + path + " (already exists)");
      if (callback != null) {
        return callback();
      }
    } else {
      var parentDir = sysPath.dirname(path);
      var write = function() {
        if (method === 'create' || method === 'overwrite') {
          logger.info("create " + path);
          fs.writeFile(path, data, callback);
        } else if (method === 'append') {
          logger.info("appending to " + path);
          fs.appendFile(path, data, callback);
        }
      };
      fs.exists(parentDir, function(exists) {
        if (exists) return write();
        logger.info("init " + parentDir);
        // chmod 755.
        mkdirp(parentDir, 0x1ed, function(error) {
          if (error != null) return logger.error(error);
          write();
        });
      });
    }
  });
};

exports.destroyFile = function(path, callback) {
  fs.unlink(path, function(error) {
    if (error != null) {
      callback(error);
      return logger.error("" + error);
    }
    logger.info("destroy " + path);
    callback();
  });
};

exports.amendFile = function(path, contents, callback) {
  fs.readFile(path, 'utf8', function(error, existingContents) {
    fs.writeFile(path, existingContents.replace(contents, ''), function(error) {
      if (error != null) {
        callback(error);
        return logger.error("" + error);
      }
      logger.info("editing contents of " + path);
      callback();
    });
  });
};

exports.scaffoldFile = function(revert, from, to, method, templateData, parentPath, callback) {
  if (parentPath) {
    to = sysPath.join(parentPath, sysPath.basename(to));
  }
  if (revert && method !== 'append') {
    exports.destroyFile(to, callback);
  } else {
    fs.readFile(from, 'utf8', function(error, contents) {
      var formatted = (function() {
        try {
          return exports.formatTemplate(contents, templateData);
        } catch (error) {
          return contents;
        }
      })();
      if (revert && method === 'append') {
        exports.amendFile(to, formatted, callback);
      } else {
        exports.generateFile(to, formatted, method, callback);
      }
    });
  }
};

exports.scaffoldFiles = function(revert, templateData, parentPath) {
  return function(generator, callback) {
    async.forEach(generator.files, function(args, next) {
      exports.scaffoldFile(
        revert, args.from, args.to, args.method, templateData, parentPath, next
      );
    }, callback);
  };
};

exports.isDirectory = function(generatorsPath) {
  return function(path, callback) {
    fs.stat(sysPath.join(generatorsPath, path), function(error, stats) {
      if (error != null) logger.error(error);
      callback(stats.isDirectory());
    });
  };
};

exports.readGeneratorConfig = function(generatorsPath) {
  return function(name, callback) {
    var path = sysPath.resolve(sysPath.join(generatorsPath, name, 'generator.json'));
    var json = require(path);
    json.name = name;
    callback(null, json);
  };
};

exports.formatGeneratorConfig = function(path, json, templateData) {
  var join = function(file) {
    return sysPath.join(path, file);
  };
  var replaceSlashes = function(string) {
    if (sysPath.sep === '\\') {
      return string.replace(/\//g, '\\');
    } else {
      return string;
    }
  };

  json.files = json.files.map(function(object) {
    return {
      method: object.method || 'create',
      from: join(replaceSlashes(object.from)),
      to: replaceSlashes(exports.formatTemplate(object.to, templateData))
    };
  });

  json.dependencies = json.dependencies.map(function(object) {
    return {
      method: object.method || 'create',
      name: object.name,
      params: exports.formatTemplate(object.params, templateData)
    };
  });

  return Object.freeze(json);
};

exports.getDependencyTree = function(generators, generatorName, memo) {
  if (memo == null) memo = [];
  var generator = generators.filter(function(gen) {
    return gen.name === generatorName;
  })[0];
  if (generator == null) {
    throw new Error("Invalid generator " + generatorName);
  }
  (generator.dependencies || []).forEach(function(dependency) {
    exports.getDependencyTree(generators, dependency.name, memo);
  });
  memo.push(generator);
  return memo;
};

exports.generateFiles = function(revert, generatorsPath, type, templateData, parentPath, callback) {
  fs.readdir(generatorsPath, function(error, files) {
    if (error != null) throw new Error(error);

    // Get directories from generators directory.
    async.filter(files, exports.isDirectory(generatorsPath), function(directories) {

      // Read all generator configs.
      async.map(directories, exports.readGeneratorConfig(generatorsPath), function(error, configs) {
        if (error != null) throw new Error(error);
        var generators = directories.map(function(directory, index) {
          var path = sysPath.join(generatorsPath, directory);
          return exports.formatGeneratorConfig(path, configs[index], templateData);
        });

        // Calculate dependency trees, do the scaffolding.
        var tree = exports.getDependencyTree(generators, type);
        async.forEach(tree, exports.scaffoldFiles(revert, templateData, parentPath), function(error) {
          if (error != null) return callback(error);
          callback();
        });
      });
    });
  });
};

exports.listGenerators = function(generatorsPath, callback) {
  fs.readdir(generatorsPath, function(error, files) {
    if (error != null) throw new Error(error);

    // Get directories from generators directory.
    async.filter(files, exports.isDirectory(generatorsPath), function(directories) {
      console.log("List of available generators in " + generatorsPath);

      directories.map(function(directory, index) {
        console.log(" * " + directory);
      });
    });
  });
};

exports.helpGenerator = function(generatorsPath, type, templateData) {
  fs.readdir(generatorsPath, function(error, files) {
    if (error != null) throw new Error(error);

    // Get directories from generators directory.
    async.filter(files, exports.isDirectory(generatorsPath), function(directories) {

      // Read all generator configs.
      async.map(directories, exports.readGeneratorConfig(generatorsPath), function(error, configs) {
        if (error != null) throw new Error(error);
        var generators = directories.map(function(directory, index) {
          var path = sysPath.join(generatorsPath, directory);
          return exports.formatGeneratorConfig(path, configs[index], templateData);
        });

        // Calculate dependency trees
        var tree = exports.getDependencyTree(generators, type);
        tree.reverse();
        tree.map(function(generator, index) {
          if (index == 0) {
            console.log("Documentation for '" + type + "' generator:");
            console.log(" 'scaffolt " + type + " name'");
          } else {
            console.log(" * " + generator.name);
          }
          async.forEach(generator.files, function(args) {
            console.log("   will " + args.method + " " + args.to);
          });
          if (index === 0 && tree.length > 1) {
            console.log("");
            console.log("Dependencies:");
          }
        });
      });
    });
  });
};

var checkIfExists = function(generatorsPath, callback) {
  fs.exists(generatorsPath, function(exists) {
    if (!exists) {
      var msg = 'Generators directory "' + generatorsPath + '" does not exist';
      logger.error(msg);
      return callback(new Error(msg));
    }

    callback();
  });
};

var scaffolt = module.exports = function(type, name, options, callback) {
  // Set some default params.
  if (options == null) options = {};
  if (callback == null) callback = function() {};

  var pluralName = options.pluralName;
  var generatorsPath = options.generatorsPath;
  var revert = options.revert;
  var parentPath = options.parentPath;

  if (pluralName == null) pluralName = inflection.pluralize(name);
  if (generatorsPath == null) generatorsPath = 'generators';
  if (revert == null) revert = false;
  var templateData = {name: name, pluralName: pluralName};

  checkIfExists(generatorsPath, function(exists) {
    exports.generateFiles(revert, generatorsPath, type, templateData, parentPath, function(error) {
      if (error != null) {
        logger.error(error);
        return callback(error);
      }
      callback();
    });
  });
};


scaffolt.list = function(options, callback) {
  // Set some default params
  if (options == null) options = {};
  if (callback == null) callback = function() {};
  var generatorsPath = options.generatorsPath;
  if (generatorsPath == null) generatorsPath = 'generators';

  checkIfExists(generatorsPath, function() {
    exports.listGenerators(generatorsPath, function(error) {
      if (error != null) {
        logger.error(error);
        return callback(error);
      }
      callback();
    });
  });
};

scaffolt.help = function(type, options) {
  // Set some default params
  if (options == null) options = {};
  var generatorsPath = options.generatorsPath;
  if (generatorsPath == null) generatorsPath = 'generators';
  var templateData = {name: "name", pluralName: "names"};

  checkIfExists(generatorsPath, function() {
    exports.helpGenerator(generatorsPath, type, templateData);
  });
};
