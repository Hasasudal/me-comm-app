import PostDetail from './post-detail';
export const metadata = { title: '게시글 | 미컴 라운지' };

export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostDetail id={id} />;
}
