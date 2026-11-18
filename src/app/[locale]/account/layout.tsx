import { AccountFrame } from "@/components/auth/account-frame";

export default function AccountLayout({ children }: LayoutProps<"/[locale]">) {
  return <AccountFrame>{children}</AccountFrame>;
}
