# uploads

file archive for [yxorp](https://yxorp.app) users

## install

```bash
git clone <this-repo> uploads
cd uploads

# allow port through firewall
sudo ufw allow 8768

# run server
PORT=8768 node server.js
```

configure in [yxorp](https://yxorp.app): `uploads.yourdomain.com → localhost:8768`

## what you get

- upload files with optional descriptions
- search through your uploads
- download/delete files
- password protected
- high file size limit (1GB default)

## security

on first visit, you'll be prompted to create a password. it's hashed (sha256) and stored in `data/password.txt`.

**reset password:** delete `data/password.txt` and restart the server.

## optional: keep it running

```bash
npm install -g pm2
PORT=8768 pm2 start server.js --name uploads
pm2 save
```

## configuration

```bash
PORT=8768 node server.js                    # custom port (default: 8768)
DATA_DIR=~/uploads node server.js           # custom data location (default: ./data)
MAX_SIZE=2147483648 node server.js          # max file size in bytes (default: 1GB)
THEME=beyondcool PORT=8768 node server.js   # use beyondcool theme (orange on black with glow)
THEME=warm PORT=8768 node server.js         # use warm theme (cream background, brown text)
THEME=hue120 PORT=8768 node server.js       # use hue-based theme (0-360, e.g. 120=green, 240=blue)
```

---

your personal file archive. upload, search, download.

