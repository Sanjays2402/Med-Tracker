# API: drugs

Reference for the drugs surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /drugs | List or read |
| POST   | /drugs | Create |
| PATCH  | /drugs/:id | Update |
| DELETE | /drugs/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
