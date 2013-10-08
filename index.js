'use strict';

var each = require('async-each');
var fs = require('fs');
var Handlebars = require('handlebars');
var inflection = require('inflection');
var mkdirp = require('mkdirp');
var sysPath = require('path');
var logger = require('loggy');

var clone = function(object) {
  if (typeof object !== 'object') return object;
  if (Array.isArray(object)) return object.slice().map(clone);
  var cloned = {};
  Object.keys(object).forEach(function(key) {
    cloned[key] = clone(object[key]);
  });
  return cloned;
}

var replaceSlashes = function(string) {
  if (sysPath.sep === '\\') {
    return string.replace(/\//g, '\\');
  } else {
    return string;
  }
};

// Async filter.
var filter = function(list, predicate, callback) {
  each(list, function(item, next) {
    predicate(item, function(value) {
      next(undefined, value);
    });
  }, function(error, filtered) {
    if (error) throw new Error(error);
    callback(list.filter(function(_, index) {
      return filtered[index];
    }));
  });
};

exports.formatTemplate = function(template, templateData) {
  if (!template) return '';
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

Handlebars.registerHelper('through', (function() {
  return function(options) {
    return new Handlebars.SafeString("{{" + options.hash["value"] + "}}")
  };
})());

exports.loadHelpers = function(helpersPath) {
  var path = sysPath.resolve(helpersPath);
  var helpers = require(path);
  helpers(Handlebars);
}

exports.generateFile = function(path, data, method, callback) {
  fs.exists(path, function(exists) {
    if (exists && method !== 'overwrite' && method !== 'append') {
      logger.info("skipping " + path + " (already exists)");
      if (callback != null) return callback();
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

exports.scaffoldFile = function(revert, from, base, method, baseTemplateData, parentPath, name, callback) {
  var templateData = {
    name: name || baseTemplateData.name,
    pluralName: name ? inflection.pluralize(name) : baseTemplateData.pluralName,
    parentPath: parentPath
  };
  var to = exports.formatTemplate(sysPath.join(parentPath, base), templateData);
  if (revert && method !== 'append') {
    exports.destroyFile(to, callback);
  } else {
    fs.readFile(from, 'utf8', function(error, contents) {
      var formatted = (function() {
        try {
          return exports.formatTemplate(contents, templateData);
        } catch (error) {
          console.log(error);
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

exports.scaffoldFiles = function(revert, templateData) {
  return function(generator, callback) {
    if (generator.helpers) exports.loadHelpers(generator.helpers);
    each(generator.files, function(args, next) {
      exports.scaffoldFile(
        revert, args.from, args.base, args.method, templateData,
        args.parentPath, args.name, next
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
  return function(type, callback) {
    var path = sysPath.resolve(sysPath.join(generatorsPath, type, 'generator.json'));
    var json = require(path);
    json.type = type;

    var helpersPath = sysPath.join(generatorsPath, type, 'helpers.js');
    fs.stat(sysPath.resolve(helpersPath), function(error, stats) {
      if (error == null && stats.isFile()) {
        json.helpers = helpersPath;
      }
      callback(null, json);
    });
  };
};

exports.formatGeneratorConfig = function(path, json, templateData) {
  var join = function(file) {
    return sysPath.join(path, file);
  };

  if (json.dependencies == null) json.dependencies = [];

  var defaultMethod = 'create';

  json.files = json.files.map(function(object) {
    return {
      method: object.method || defaultMethod,
      base: sysPath.basename(replaceSlashes(object.to)),
      from: join(replaceSlashes(object.from)),
      parentPath: templateData.parentPath || sysPath.dirname(replaceSlashes(object.to))
    };
  });

  if (templateData.parentPath) 
    json.parentPath = templateData.parentPath;

  json.dependencies = json.dependencies.map(function(object) {
    if (!object.type) {
      object.type = object.name;
      object.name = undefined;
    }

    var dependencyTemplateData = clone(templateData);
    dependencyTemplateData.parentPath = json.parentPath;
    
    if (object.parentPath && !json.parentPath) {
      logger.warn('generator "' + json.type + '" needs parentPath to function correctly with dependencies');
    }

    return {
      method: object.method || defaultMethod,
      type: exports.formatTemplate(object.type, dependencyTemplateData),
      name: exports.formatTemplate(object.name || dependencyTemplateData.name, dependencyTemplateData),
      parentPath: exports.formatTemplate(object.parentPath || templateData.parentPath, dependencyTemplateData)
    };
  });

  return Object.freeze(json);
};

exports.getDependencyTree = function(generators, type, memo, dep) {
  if (memo == null) memo = [];
  var generator = clone(generators.filter(function(gen) {
    return gen.type === type;
  })[0]);
  if (generator == null) {
    throw new Error("Invalid generator " + type);
  }
  if (dep && dep.parentPath) {
    generator.files.forEach(function(file) {
      if (dep.parentPath) file.parentPath = dep.parentPath;
      if (dep.name) file.name = dep.name;
    });
  }
  (generator.dependencies || []).forEach(function(dependency) {
    exports.getDependencyTree(generators, dependency.type, memo, dependency);
  });
  memo.push(Object.freeze(generator));
  return memo;
};

exports.generateFiles = function(revert, generatorsPath, type, templateData, callback) {
  fs.readdir(generatorsPath, function(error, files) {
    if (error != null) throw new Error(error);

    // Get directories from generators directory.
    filter(files, exports.isDirectory(generatorsPath), function(directories) {
      // Read all generator configs.
      each(directories, exports.readGeneratorConfig(generatorsPath), function(error, configs) {
        if (error != null) throw new Error(error);
        var generators = directories.map(function(directory, index) {
          var path = sysPath.join(generatorsPath, directory);
          return exports.formatGeneratorConfig(path, configs[index], templateData);
        });

        // Calculate dependency trees, do the scaffolding.
        var tree = exports.getDependencyTree(generators, type);
        // console.log(JSON.stringify(tree, null, 2));
        each(tree, exports.scaffoldFiles(revert, templateData), callback);
      });
    });
  });
};

exports.listGenerators = function(generatorsPath, callback) {
  fs.readdir(generatorsPath, function(error, files) {
    if (error != null) throw new Error(error);

    // Get directories from generators directory.
    filter(files, exports.isDirectory(generatorsPath), function(directories) {
      console.log("List of available generators in ./" + generatorsPath + ":");

      each(directories, exports.readGeneratorConfig(generatorsPath), function(error, configs) {
        configs.map(function(generator) {
          var doc = " * ";
          doc += (generator.name) ? generator.name : generator.type;
          if (generator.description) doc += " ("+ generator.description + ")";
          console.log(doc);
        });
      });
    });
  });
};

exports.helpGenerator = function(generatorsPath, type, templateData) {
  fs.readdir(generatorsPath, function(error, files) {
    if (error != null) throw new Error(error);

    // Get directories from generators directory.
    filter(files, exports.isDirectory(generatorsPath), function(directories) {

      // Read all generator configs.
      each(directories, exports.readGeneratorConfig(generatorsPath), function(error, configs) {
        if (error != null) throw new Error(error);
        var generators = directories.map(function(directory, index) {
          var path = sysPath.join(generatorsPath, directory);
          return exports.formatGeneratorConfig(path, configs[index], templateData);
        });

        var tree = exports.getDependencyTree(generators, type);
        tree.reverse();
        tree.map(function(generator, index) {
          if (index == 0) {

            console.log("Documentation for '" + type + "' generator:");
            if (generator.description) {
              console.log(generator.description+"\n");
            }
            console.log("'scaffolt " + type + " name'");
          } else {
            var doc = " * " + generator.type;
            if (generator.description) {
              doc += " (" + generator.description + ")";
            }
            console.log(doc);
          }
          each(generator.files, function(args) {
            console.log("\twill " + args.method + " " + args.to);
          });
          if (index == 0 && tree.length > 1) {
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
  var templateData = {name: name, pluralName: pluralName, parentPath: parentPath};

  checkIfExists(generatorsPath, function(exists) {
    exports.generateFiles(revert, generatorsPath, type, templateData, function(error) {
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
