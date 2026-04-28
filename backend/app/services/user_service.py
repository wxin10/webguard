from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.exceptions import WebGuardException
from ..core.security import hash_password
from ..models import User


VALID_ROLES = {"admin", "user"}
DEFAULT_USERS = {
    "admin": {
        "role": "admin",
        "display_name": "系统管理员",
        "email": "admin@example.local",
    },
    "guest": {
        "role": "user",
        "display_name": "访客用户",
        "email": "guest@example.local",
    },
}


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create_user(self, username: str, role: str = "user", email: str | None = None) -> User:
        clean_username = (username or "guest").strip() or "guest"
        user = self.db.query(User).filter(User.username == clean_username).first()
        if user:
            if email and not user.email:
                user.email = email
            self.db.flush()
            return user

        clean_role = self._validate_role(role)
        user = User(
            username=clean_username,
            email=email,
            display_name=clean_username,
            role=clean_role,
            is_active=True,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def ensure_default_users(self) -> None:
        """Ensure built-in seed accounts exist."""
        for username, defaults in DEFAULT_USERS.items():
            password = settings.DEFAULT_ADMIN_PASSWORD if username == "admin" else settings.DEFAULT_GUEST_PASSWORD
            user = self.db.query(User).filter(User.username == username).first()
            if user is None:
                user = User(
                    username=username,
                    email=defaults["email"],
                    display_name=defaults["display_name"],
                    role=defaults["role"],
                    password_hash=hash_password(password),
                    is_active=True,
                )
                self.db.add(user)
                continue

            user.role = defaults["role"]
            user.display_name = defaults["display_name"]
            user.is_active = True
            if not user.password_hash:
                user.password_hash = hash_password(password)
            if not user.email:
                user.email = defaults["email"]
        self.db.flush()

    def list_users(
        self,
        *,
        keyword: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> list[User]:
        query = self.db.query(User)
        if keyword:
            pattern = f"%{keyword.strip()}%"
            query = query.filter(
                or_(
                    User.username.ilike(pattern),
                    User.email.ilike(pattern),
                    User.display_name.ilike(pattern),
                )
            )
        if role:
            query = query.filter(User.role == self._validate_role(role))
        if is_active is not None:
            query = query.filter(User.is_active.is_(is_active))
        return query.order_by(User.created_at.desc(), User.id.desc()).all()

    def create_user(
        self,
        *,
        username: str,
        password: str,
        role: str = "user",
        email: str | None = None,
        display_name: str | None = None,
    ) -> User:
        clean_username = self._clean_username(username)
        clean_role = self._validate_role(role)
        clean_email = self._clean_email(email)
        self._validate_password(password)

        if clean_username == "guest" and clean_role == "admin":
            raise WebGuardException(status_code=422, detail="guest cannot be admin", code=42201)
        self._ensure_username_available(clean_username)
        if clean_email:
            self._ensure_email_available(clean_email)

        user = User(
            username=clean_username,
            email=clean_email,
            display_name=(display_name or clean_username).strip() or clean_username,
            role=clean_role,
            password_hash=hash_password(password),
            is_active=True,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def update_user(
        self,
        user_id: int,
        *,
        email: str | None = None,
        display_name: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> User:
        user = self._get_user_or_404(user_id)
        if email is not None:
            clean_email = self._clean_email(email)
            if clean_email:
                self._ensure_email_available(clean_email, user_id=user.id)
            user.email = clean_email
        if display_name is not None:
            user.display_name = display_name.strip() or user.username
        if role is not None:
            self.change_role(user, role)
        if is_active is not None:
            self.set_user_active(user, is_active)
        self.db.flush()
        return user

    def set_user_active(self, user: User | int, is_active: bool) -> User:
        target = self._coerce_user(user)
        if not is_active:
            if target.username == "admin":
                raise WebGuardException(status_code=422, detail="default admin cannot be disabled", code=42201)
            self._ensure_can_remove_admin(target, "disable last admin")
        target.is_active = is_active
        self.db.flush()
        return target

    def reset_password(self, user_id: int, password: str) -> User:
        user = self._get_user_or_404(user_id)
        self._validate_password(password)
        user.password_hash = hash_password(password)
        self.db.flush()
        return user

    def change_role(self, user: User | int, role: str) -> User:
        target = self._coerce_user(user)
        clean_role = self._validate_role(role)
        if target.username == "admin" and clean_role != "admin":
            raise WebGuardException(status_code=422, detail="default admin cannot be downgraded", code=42201)
        if target.username == "guest" and clean_role != "user":
            raise WebGuardException(status_code=422, detail="default guest cannot be upgraded", code=42201)
        if target.role == "admin" and clean_role != "admin":
            self._ensure_can_remove_admin(target, "downgrade last admin")
        target.role = clean_role
        self.db.flush()
        return target

    def soft_delete_user(self, user_id: int) -> User:
        user = self._get_user_or_404(user_id)
        return self.set_user_active(user, False)

    def _coerce_user(self, user: User | int) -> User:
        return user if isinstance(user, User) else self._get_user_or_404(user)

    def _get_user_or_404(self, user_id: int) -> User:
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise WebGuardException(status_code=404, detail="user not found", code=40401)
        return user

    def _ensure_can_remove_admin(self, user: User, detail: str) -> None:
        if user.role != "admin" or not user.is_active:
            return
        active_admin_count = (
            self.db.query(func.count(User.id))
            .filter(User.role == "admin", User.is_active.is_(True))
            .scalar()
            or 0
        )
        if active_admin_count <= 1:
            raise WebGuardException(status_code=422, detail=detail, code=42201)

    def _ensure_username_available(self, username: str) -> None:
        if self.db.query(User).filter(User.username == username).first():
            raise WebGuardException(status_code=409, detail="username already exists", code=40901)

    def _ensure_email_available(self, email: str, user_id: int | None = None) -> None:
        query = self.db.query(User).filter(User.email == email)
        if user_id is not None:
            query = query.filter(User.id != user_id)
        if query.first():
            raise WebGuardException(status_code=409, detail="email already exists", code=40901)

    @staticmethod
    def _clean_username(username: str) -> str:
        clean_username = (username or "").strip()
        if not clean_username:
            raise WebGuardException(status_code=400, detail="username is required", code=40002)
        return clean_username

    @staticmethod
    def _clean_email(email: str | None) -> str | None:
        clean_email = (email or "").strip()
        return clean_email or None

    @staticmethod
    def _validate_role(role: str | None) -> str:
        clean_role = (role or "user").strip()
        if clean_role not in VALID_ROLES:
            raise WebGuardException(status_code=422, detail="role must be admin or user", code=42201)
        return clean_role

    @staticmethod
    def _validate_password(password: str) -> None:
        if not password or len(password) < 6:
            raise WebGuardException(status_code=422, detail="password must be at least 6 characters", code=42201)
