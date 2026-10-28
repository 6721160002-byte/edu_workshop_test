# ER Diagram

```mermaid
erDiagram
  USERS ||--o{ REGISTRATIONS : registers
  WORKSHOPS ||--o{ REGISTRATIONS : includes
  REGISTRATIONS ||--o| RATINGS : receives
  USERS ||--o{ RATINGS : submits
  USERS ||--o{ COMPLAINTS : creates
  COMPLAINTS ||--o{ COMPLAINT_REPLIES : has
  USERS ||--o{ COMPLAINT_REPLIES : answers
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ SESSIONS : signs_in
  USERS ||--o{ PASSWORD_RESET_GRANTS : resets

  USERS {
    text id PK
    text name
    text email UK
    text phone UK
    text status
    text role
    text password_hash
  }
  WORKSHOPS {
    text id PK
    text title
    text start_at
    text end_at
    int capacity
    real hours
    int closed
  }
  REGISTRATIONS {
    text id PK
    text user_id FK
    text workshop_id FK
    text status
    text created_at
    text updated_at
  }
  RATINGS {
    text id PK
    text registration_id FK_UK
    text user_id FK
    int score
  }
  COMPLAINTS {
    text id PK
    text user_id FK
    text issue
    text status
  }
  COMPLAINT_REPLIES {
    text id PK
    text complaint_id FK
    text staff_id FK
    text message
  }
  NOTIFICATIONS {
    text id PK
    text user_id FK
    text title
    text read_at
  }
```
