import { LogoutButton } from './LogoutButton'

export function AccountNotProvisionedPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-medium">Account not set up</h1>
      <p className="max-w-md text-muted-foreground">
        Your account isn&apos;t set up yet. Contact your administrator.
      </p>
      <LogoutButton />
    </div>
  )
}
