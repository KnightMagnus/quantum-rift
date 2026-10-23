# Hosting a friend game

A friend game runs one authoritative Game on the host’s computer. The host plays
in a browser alongside friends; all captains inhabit the same saved universe.
No Nakama, PostgreSQL, paid cloud service or separate player installation is
required. Friends need a modern browser and a reachable address for the host.
This is a listen server, not mesh networking or peer-to-peer simulation.

The 3.3.2 complete release includes compiled modules and friend launchers. Use
the [pinned runtime](TYPESCRIPT-RUNTIME.md). Ordinary startup still selects
[dedicated native Nakama](NAKAMA.md), not friend hosting.

## Start and invite

1. Install the pinned runtime and extract the complete release ZIP. No dependency
   installation or build is needed to play. For a source checkout, run `npm ci`
   and `npm run build` first.
2. On Windows, open **Start Friend Game.bat**. On macOS/Linux, run
   `sh start-friends.command`. The terminal equivalent is
   `node tools/start.ts --friends`. These explicitly opt into LAN listening by
   setting `HOST_FRIENDS=1` and, unless already set, `HOST_BIND=0.0.0.0`.
3. Keep the server window open. The launcher opens the host’s browser; if it
   cannot, open the address printed in the terminal, normally
   `http://localhost:8080` on the host computer.
4. Share a reachable LAN or VPN address, such as `http://192.168.1.25:8080`,
   with friends. Replace the example with the host computer’s actual address.
   The server prints candidate LAN URLs; it cannot guarantee they are reachable.
5. Each player signs in with a different captain name and their own password.
   The login status says “Friend-hosted universe.” Do not share one captain
   between players; another login to the same captain replaces its connection.

The host can also open the shared URL. It serves the same universe as the local
URL. **A friend’s `localhost` points to their own computer, not the host.**
Likewise, `0.0.0.0` is a listener setting, not an invitation address.

## Listener and address settings

Raw `HOST_FRIENDS=1` startup defaults to loopback only. Network access requires an
explicit `HOST_BIND` setting or the LAN-opt-in friend launcher above.

| Setting              | Meaning                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `HOST_FRIENDS=1`     | Select the Node friend authority; incompatible with Solo                                               |
| `HOST_BIND`          | Literal IPv4/IPv6 listener address; default `127.0.0.1`; `0.0.0.0` listens on all IPv4 interfaces      |
| `PORT`               | HTTP and gameplay WebSocket port, default `8080`; valid range 1–65535                                  |
| `FRIEND_DATA_DIR`    | Save directory, default `friend-data/` relative to the game root                                       |
| `HOST_PUBLIC_ORIGIN` | Optional browser-facing HTTP(S) origin for a manually configured proxy, such as `https://rift.example` |

For example, in a macOS/Linux shell:

```sh
HOST_FRIENDS=1 HOST_BIND=0.0.0.0 node tools/start.ts
```

For Windows PowerShell:

```powershell
$env:HOST_FRIENDS = '1'
$env:HOST_BIND = '0.0.0.0'
node tools/start.ts
```

`HOST_PUBLIC_ORIGIN` accepts an origin only: no credentials, path, query or
fragment. HTTP requests and WebSocket upgrades accept only `localhost`, local
interface or listener IP addresses, or the authority explicitly named by
`HOST_PUBLIC_ORIGIN`. Local addresses must use the configured port; arbitrary
DNS names are rejected even when the browser Origin matches. Set
`HOST_PUBLIC_ORIGIN` when inviting friends through a custom hostname. It also
permits that browser origin through the WebSocket origin check, but does not
create DNS, a proxy, TLS, a tunnel or router access. A proxy must forward
HTTP and WebSocket traffic to this one server. Forwarded-host headers are not
trusted as origin authorization. Friend mode uses `HOST_BIND`, not the dedicated
web host’s `HOST` setting.

## Saves and world ownership

The host’s `friend-data/` contains the shared world and captain accounts, using
the local database journal. Restart with the same directory to continue that
universe. Stop the server cleanly before copying its entire save directory for a
backup or moving it to another host. Keep backups private: they include account
credentials as well as progress.

Run only one host per save directory, even on different ports. Before opening
the database, the server exclusively creates `.friend-host.lock/` in that
directory. A clean stop (Ctrl+C or SIGTERM) flushes the database and removes its
lock. A crash, startup failure or failed flush can leave the lock behind; the
next startup refuses to take over automatically. Before manually removing only
`.friend-host.lock/`, verify that no host on any machine is using that save
directory and back up the directory. The lock’s `owner.json` is a diagnostic
hint, not proof that a process is no longer running. Never remove a live host’s
lock or start another host against its saves.

Friend startup sets a restrictive umask (`077`) and applies POSIX permissions
`0700` to save directories and `0600` to files, including existing checkpoints
and backups. Linked or special entries inside the store are rejected. On
Windows, these mode bits do not replace access-control lists: keep the save
directory and backups in an account-private location and check its Windows ACLs.

Solo saves, friend saves and dedicated Nakama storage are separate. They do not
automatically import, merge or synchronize across backends. Friend games have no
Solo pause, save slots or save-file import/export. No demo captains are seeded.
The server rejects Solo mode, developer seed/invasion overrides and `DATA_DIR`
in friend mode; use a separate `FRIEND_DATA_DIR` rather than `data/` or
`solo-data/`. Canonical path checks also reject overlapping directories and
symlink aliases of those protected stores, including aliases through existing
parent directories. Preserve all existing save directories when updating.

There is one server clock, not a simulation on every browser. The world is
available only while the host process is running; closing a browser alone does
not stop it. This mode does not provide host migration, distributed authority or
cross-backend autosync.

## LAN, VPN and Internet access

Use a trusted LAN or a VPN that lets friends reach the host’s VPN address.
The host firewall must allow the chosen listener and port. No firewall rules,
router ports or tunnels are changed automatically.

Internet access otherwise requires the owner to configure router port forwarding
and firewall rules manually; carrier-grade NAT or network policy may prevent it.
There is no automatic NAT traversal. Direct HTTP/WS does not encrypt passwords
or gameplay traffic. Use a trusted LAN/VPN, or configure HTTPS/WSS through a
reverse proxy before exposing sign-in to the public Internet. Public deployment
also needs appropriate host security and backups. These are setup requirements,
not evidence that an Internet deployment has been tested.

## If friends cannot connect

- Confirm the host game is running and the URL uses the host’s actual LAN/VPN
  address and configured port, not `localhost` or `0.0.0.0`.
- Check the listener: a loopback address admits only the host computer. Restart
  with an explicit network bind if LAN access is intended.
- Check the host firewall, VPN routing and any manually configured proxy.
- If the port is already in use, close the older game server first. Do not
  assume an already-open browser tab belongs to the new server.
- If the login status says online play uses Nakama, the browser reached the
  dedicated web host rather than the friend authority.

See [regression coverage](TEST-COVERAGE.md#friend-host-authority) for the bounded
local checks and their limits.
