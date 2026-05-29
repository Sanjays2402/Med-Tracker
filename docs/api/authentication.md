# API: authentication

Reference for the authentication surface of the Med-Tracker HTTP API.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | /authentication | List or read |
| POST   | /authentication | Create |
| PATCH  | /authentication/:id | Update |
| DELETE | /authentication/:id | Delete |

## Auth

All endpoints require a bearer token, except where noted.

## Errors

Errors follow `{ "error": { "code": "...", "message": "..." } }`.
