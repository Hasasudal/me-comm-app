import PostDetail from './post-detail';

export default async function DetailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 return <PostDetail id={id}/>;
}
