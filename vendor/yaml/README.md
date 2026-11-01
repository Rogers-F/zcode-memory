YAML 2.9.0 by Eemeli Aro, ISC; see LICENSE and upstream repository in package.json.
The CommonJS JavaScript files are unchanged copies of the installed npm package's
dist/*.js tree, relocated to lib/; declarations and browser builds are omitted.
package.json main/exports point to this CommonJS subset. This keeps formal Git
marketplace installs offline without checking in node_modules or generated dist.
