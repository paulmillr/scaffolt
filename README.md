# scaffolt

Dead-simple scaffolder. Consumes JSON generators with Handlebars support.

Install with npm: `npm install -g scaffolt`.

## Usage

```
Usage: scaffolt <type> <name> [options]

Options:

  -h, --help               output usage information
  -V, --version            output the version number
  -p, --path [path]        override path to directory to which recipe will be copied
  -r, --revert             should scaffolt revert changes done by previous scaffolding?
  -g, --generators [path]  path to directory which contains generators specifications [./generators]
  -l, --list               list availables generators
  -d, --doc [type]         display generator documentation
```

Examples:

```bash
scaffolt view user
scaffolt model cart --revert
scaffolt controller header --path controllers/regions
scaffolt --list
scaffolt collection --doc
```

Generator JSON examples (more examples: [paulmillr/brunch-with-chaplin](https://github.com/paulmillr/brunch-with-chaplin/tree/master/generators)):

```json
{"files": [{"from": "model.js.hbs", "to": "app/models/{{name}}.js"}]}
```

```json
{
  "files": [
    {
      "from": "controller.coffee.hbs",
      "to": "app/controllers/{{name}}-controller.coffee"
    },
    {
      "from": "route.coffee.hbs",
      "to": "app/routes.coffee",
      "method": "append"
    }
  ],
  "dependencies": [
    {"type": "model"},
    {"type": "view", "name": "{{name}}-item"},
    {"type": "style", "name": "{{pluralName}}", "parentPath": "{{parentPath}}/styles"},
    {"type": "template", "name": "{{pluralName}}", "parentPath": "{{parentPath}}/templates"}
  ],
  "description" : "Simple controller"
}
```
`description` field is optionnal.

You can add Handlebars helpers in your generator folder by adding `helpers.js` file.

Generator Helpers definition file example:

```javascript
module.exports = function(Handlebars) {
  Handlebars.registerHelper('date', (function() {
    var date = new Date();
    return function(options) {
      return date.toString();
    };
  })());
};
```

So now you can use it in your generators source file. Example:

```
# Generation Date : {{date}}
```

You can use it programmatically too, from node.js:

```javascript
var scaffolt = require('scaffolt');

scaffolt('view', 'user', function(error) {
  console.log('Scaffolded!');
});

scaffolt('model', 'cart', {
  generatorsPath: 'custom-gens-dir',
  parentPath: 'custom-app/models/carting.js',
  revert: true
}, function(error) {
  console.log('Reverted!');
});
```

## License

The MIT License (MIT)

Copyright (c) 2013 Paul Miller (http://paulmillr.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
