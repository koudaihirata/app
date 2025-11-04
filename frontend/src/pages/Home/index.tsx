import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Home() {
    const navigate = useNavigate()

    useEffect(() => {
        navigate('/rooms')
    },[])

    return(
        <>
            <p>ホームページ</p>
            <Link to={'/rooms'}>ルーム選択</Link>
        </>
    )
}