# Third-Party Notices

AI Bookmark OS includes or derives from third-party software. Those components
remain subject to their original licenses and copyright notices.

## Markline

- Location: `src/timeline/`
- Upstream: <https://github.com/jdf12/Markline>
- License: MIT
- Copyright: Copyright (c) 2026 jdf12
- License text: [`src/timeline/LICENSE.markline`](src/timeline/LICENSE.markline)

AI Bookmark OS uses Markline as a reference and adapts its bookmark timeline
foundation and parts of its extension runtime. We thank jdf12 and the Markline
contributors for making their work available under the MIT License.

## Mozilla Readability

- Location: `src/timeline/background/vendor/Readability.js`
- Upstream: <https://github.com/mozilla/readability>
- License: Apache License 2.0
- Copyright: Copyright (c) 2010 Arc90 Inc
- License notice: preserved in the source file header
- Full license text: [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt)
- Source note: the vendored file references Arc90 Readability 1.7.1; the exact Mozilla upstream revision was not recorded in this repository

## Cytoscape.js

- Location: `src/timeline/background/vendor/cytoscape.min.js`
- Upstream: <https://github.com/cytoscape/cytoscape.js>
- Version: 3.34.0
- License: MIT
- Copyright: Copyright (c) 2016-2026, The Cytoscape Consortium
- License notice: preserved in the source file header

## React, React DOM, and Scheduler

- Location: bundled into the React UI build
- Upstream: <https://github.com/facebook/react>
- Versions: React 18.3.1, React DOM 18.3.1, Scheduler 0.23.2
- License: MIT
- Copyright: Copyright (c) Facebook, Inc. and its affiliates
- License text: [`LICENSES/MIT-React.txt`](LICENSES/MIT-React.txt)

## Lucide React

- Location: bundled into the React UI build
- Upstream: <https://github.com/lucide-icons/lucide>
- Version: 0.468.0
- License: ISC
- Copyright: Lucide Contributors and Feather contributors
- License text: [`LICENSES/ISC-Lucide.txt`](LICENSES/ISC-Lucide.txt)

## npm Dependencies

Development and runtime package dependencies are declared in `package.json` and
locked in `package-lock.json`. Their respective licenses remain applicable.
