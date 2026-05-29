# API: errors

Reference for the errors surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /errors | List or read |
| POST   | /errors | Create |
| PATCH  | /errors/:id | Update |
| DELETE | /errors/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
