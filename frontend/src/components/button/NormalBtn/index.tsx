import styles from './styles.module.css'

type Type = {
    label: string,
    onClick: () => void
}

export default function NormalBtn(props: Type) {
    return(
        <>
            <button className={styles.btn} onClick={props.onClick}>{props.label}</button>
        </>
    )
}