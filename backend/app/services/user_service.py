from sqlalchemy.orm import Session

from ..models import User


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create_user(self, username: str, role: str = "user", email: str | None = None) -> User:
        clean_username = (username or "platform-user").strip() or "platform-user"
        user = self.db.query(User).filter(User.username == clean_username).first()
        if user:
            if email and not user.email:
                user.email = email
            if role and clean_username != "platform-user" and user.role != role:
                user.role = role
            self.db.flush()
            return user

        user = User(
            username=clean_username,
            email=email,
            display_name=clean_username,
            role=role or "user",
            is_active=True,
        )
        self.db.add(user)
        self.db.flush()
        return user
