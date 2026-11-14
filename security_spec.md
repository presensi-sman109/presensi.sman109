# Security Specification — SMA Negeri 109 Jakarta Presensi & Kartu Pelajar

## 1. Data Invariants
1. **Default-Deny Catch-All**: All Firestore paths not explicitly matched are denied.
2. **Verified Staff Authentication**: Every read/write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Strict Path ID Validation**: All document IDs (`studentId`, `attendanceId`, `adminId`, `logId`, `settingId`) must pass `isValidId()` (`^[a-zA-Z0-9_\\-]+$`, length <= 128).
4. **Role-Based Access Control (RBAC)**:
   - `super_admin` (Bootstrapped emails: `presensi.sman109@gmail.com`, `sudiyantoro62@gmail.com`, or active `super_admin` in `/admins/{uid}`): Full access to all collections including `/admins` and `/school_settings`.
   - `admin`: Can manage `/students`, `/attendances`, `/school_settings`, and append `/admin_logs`; cannot modify `/admins`.
   - `operator`: Can read `/students` and manage `/attendances`, append `/admin_logs`; cannot delete students, cannot modify `/admins` or `/school_settings`.
5. **Anti-Shadow-Field & Type/Size Bounds**: Every create and update enforces exact key allowlists (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update) and strict `.size()` limits on all strings and lists.
6. **PII Isolation**: `/admins` documents (containing `email`, `telepon`, `password`) are only readable by `super_admin` or the owner (`adminId == request.auth.uid`).

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated write to `/students/0081234567`.
2. Unverified email user (`email_verified: false`) attempting read/write on `/students`.
3. Non-admin student/external user attempting to create a `/admins/hacker` doc with `role: "super_admin"`.
4. Shadow update adding `isAdmin: true` or `ghostField: 123` to `/students/0081234567`.
5. Oversized string ID (>128 chars) or invalid characters (`../hack`) in document ID.
6. Operator attempting to delete a student record or edit `/school_settings/main`.
7. Operator attempting to update `/admins/sudiyantoro` password or role.
8. Invalid attendance `status: "Bolos"` (outside enum `["Hadir", "Sakit", "Ijin", "Alpa"]`).
9. Invalid attendance `date: "2026/11/14"` (fails `^\\d{4}-\\d{2}-\\d{2}$`).
10. Oversized `foto` payload (> 150,000 chars) on `/students`.
11. Missing required fields (`nis`, `nama`, `kelas`) on student create.
12. Attempting to tamper with existing `/admin_logs/{logId}` (logs are append-only, update/delete denied).
