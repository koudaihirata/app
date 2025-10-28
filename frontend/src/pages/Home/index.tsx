import { Link } from "react-router-dom";


export default function Home() {
    return(
        <>
            <p>ホームページ</p>
            <Link to={'/rooms'}>ルーム選択</Link>
        </>
    )
}