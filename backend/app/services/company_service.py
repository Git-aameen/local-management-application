from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyUpdate


async def list_companies(db: AsyncSession, page: int, page_size: int) -> tuple[list[Company], int]:
    total = await db.scalar(select(func.count()).select_from(Company))
    result = await db.execute(
        select(Company).order_by(Company.id).offset((page - 1) * page_size).limit(page_size)
    )
    return list(result.scalars().all()), total or 0


async def get_company(db: AsyncSession, company_id: int) -> Company | None:
    return await db.get(Company, company_id)


async def create_company(db: AsyncSession, payload: CompanyCreate) -> Company:
    company = Company(name=payload.name)
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


async def update_company(db: AsyncSession, company_id: int, payload: CompanyUpdate) -> Company | None:
    company = await db.get(Company, company_id)
    if company is None:
        return None
    if payload.name is not None:
        company.name = payload.name
    await db.commit()
    await db.refresh(company)
    return company
