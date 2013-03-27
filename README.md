# scaffolt

Dead-simple scaffolder. Consumes JSON generators with Handlebars support.

Install with npm: `npm install -g scaffolt`.

## Usage

```
Usage: scaffolt <type> <name> [options]

Options:

  -h, --help               output usage information
  -V, --version            output the version number
  -p, --path [path]        path to directory to which recipe will be copied
  -r, --revert             should scaffolt revert changes done by previous scaffolding?
  -g, --generators [path]  path to directory which contains generators specifications [./generators]
  -l, --list               list availables generators
  -d, --doc [type]         display generator documentation
```

Examples:

```bash
scaffolt view user
scaffolt model cart --revert
scaffolt controller header --path controllers/regions/header.coffee
scaffolt --list
scaffolt collection --doc
```

Generator JSON example (more examples: [paulmillr/brunch-with-chaplin](https://github.com/paulmillr/brunch-with-chaplin/tree/master/generators)):

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
    {"name": "model", "params": "{{name}}"},
    {"name": "view", "params": "{{name}}-item"},
    {"name": "style", "params": "{{pluralName}}"},
    {"name": "template", "params": "{{pluralName}}"}
  ]
}
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
