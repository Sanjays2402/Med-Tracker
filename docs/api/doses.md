# API: doses

Reference for the doses surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /doses | List or read |
| POST   | /doses | Create |
| PATCH  | /doses/:id | Update |
| DELETE | /doses/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
