# Pipe Annotation Reviewer

A browser-based interface for reviewing and editing pipe-component annotations. Organise your own images into named batches, or explore three supplied Genshin Impact scenes instead of confidential project imagery.

## Open the demo

[Open the dashboard](https://balliewiththeie.github.io/panorama-annotation-reviewer/) once GitHub Pages deployment is complete. Choose **New batch**, enter a name, and select or drop multiple JPEG, PNG or WebP images. Each picture becomes one review item; panorama splitting is not included. Open a thumbnail to annotate it, or open the sample batch to try the guided mouse tutorial.

Uploads are stored locally using IndexedDB, not sent to a server or shared with other visitors. Use the same browser and site address to return to your batches. Clearing browser data removes uploaded batches. Keep the original images and download annotation JSON backups. A JSON export can be imported into its original batch and revision; it does not recreate a lost image library.

Limits: 50 images per batch, 15 MB per image, 150 MB per batch, and 40 megapixels per image. Browser storage capacity may impose a lower limit. Files that cannot be decoded are listed before creation. New batches start without annotations. The sample images retain the existing 53 reviewed boxes.

You can also open index.html locally, but browser storage support for local files varies. GitHub Pages is the preferred place to test uploads. No server or account is required.

## Try it

- Select an existing box and change its class, dimensions, angle, or uncertainty flag.
- Press B and drag to add a box. Use undo/redo to reverse edits.
- Zoom with the wheel and pan with Space + drag.
- Mark a scene reviewed and add notes.
- Download edits as JSON and import them again into this demo.

Edits are stored in this browser. Export JSON for a portable copy. Uploaded images use their native dimensions; exports include image_size for each image. The sample boxes are illustrative; they are not validated industrial annotations. Revision 02 starts with 53 active user-reviewed annotations across three reviewed scenes; four deleted records are retained for history. Earlier revision 01 exports belong to the previous baseline. The sample scenes use the existing 1920 × 1080 annotation canvas, so some have blank margins.

## My contribution and AI assistance

I directed the interface through prompts and iteration. Codex generated the implementation. This project demonstrates an AI-assisted UI workflow; it is not presented as independently hand-written code.

## Sample image sources and rights

The user supplied three Genshin Impact screenshots. Source references supplied by the user:

- https://gurugamer.com/mobile-games/genshin-impact-fontaine-release-sneak-peek-22471
- https://www.hoyolab.com/article/24005097

The exact source of each of the first two screenshots has not been independently verified. The third screenshot was supplied alongside these source links. © All rights reserved by COGNOSPHERE. Other properties belong to their respective owners. This demo is not affiliated with or endorsed by HoYoverse. The screenshots are third-party demonstration assets, not original artwork by this project's author, and are excluded from any code license. Permission for this specific redistribution has not been independently verified.

## GitHub Pages setup

Upload the contents of this folder to the repository root, including assets/ and images/. In Settings → Pages, choose Deploy from a branch, main, and /(root), then Save. This is a static site with no build dependencies. Original confidential project images, annotations, identifiers, and history are not included.
