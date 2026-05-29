# API: rate-limiting

Reference for the rate-limiting surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /rate-limiting | List or read |
| POST   | /rate-limiting | Create |
| PATCH  | /rate-limiting/:id | Update |
| DELETE | /rate-limiting/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
