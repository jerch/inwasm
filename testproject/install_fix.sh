#!/bin/bash

# remove locally linked inwasm from project and place packaged version instead
sed 's/\"inwasm\": \"file:\.\.\/inwasm\"//g' package.json > tmp
mv tmp package.json
npm install inwasm    # grab latest package
rm -rf node_modules   # reset folder to clean state
