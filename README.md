# Zea Collab

## How to add Zea Collab to your project

Insert these tags in your page:

For staging environment:

```html
<script src="https://websocket-staging.zea.live/socket.io/socket.io.js"></script>
<script crossorigin src="https://unpkg.com/@zeainc/zea-collab"></script>
```

For production environment:

```html
<script src="https://websocket.zea.live/socket.io/socket.io.js"></script>
<script crossorigin src="https://unpkg.com/@zeainc/zea-collab"></script>
```


## To build and dist

```bash
yarn run dist
```

