# API: exports

Reference for the exports surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /exports | List or read |
| POST   | /exports | Create |
| PATCH  | /exports/:id | Update |
| DELETE | /exports/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
