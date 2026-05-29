# API: interactions

Reference for the interactions surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /interactions | List or read |
| POST   | /interactions | Create |
| PATCH  | /interactions/:id | Update |
| DELETE | /interactions/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
