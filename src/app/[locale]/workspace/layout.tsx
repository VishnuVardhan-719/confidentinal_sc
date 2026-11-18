import { AccountFrame } from "@/components/auth/account-frame";

export default function WorkspaceLayout({ children }: LayoutProps<"/[locale]">) {
  return <AccountFrame>{children}</AccountFrame>;
}
