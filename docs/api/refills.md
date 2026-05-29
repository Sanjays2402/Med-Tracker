# API: refills

Reference for the refills surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /refills | List or read |
| POST   | /refills | Create |
| PATCH  | /refills/:id | Update |
| DELETE | /refills/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
