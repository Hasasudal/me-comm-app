import SisaPanel from '../sisa-panel';
export const metadata = { title: '시사 모음집 | 미컴 라운지' };
export default async function SisaViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SisaPanel id={id} />;
}
