import styles from './styles.module.css'

type Type = {
    label: string,
    bg: string,
    onClick: () => void
}

export default function NormalBtn(props: Type) {
    return(
        <>
            <button
                className={styles.btn}
                style={{backgroundColor: props.bg}}
                onClick={props.onClick}
            >
                {props.label}
            </button>
        </>
    )
}