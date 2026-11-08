import { AuthFrame } from '../../components/auth-frame';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>;
}
