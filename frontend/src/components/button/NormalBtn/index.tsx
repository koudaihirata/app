import styles from './styles.module.css'

type Type = {
    label: string,
    bg?: string,
    onClick: () => void,
    disabled?: boolean
}

export default function NormalBtn(props: Type) {
    const { label, bg, onClick, disabled } = props
    return(
        <>
            <button
                className={styles.btn}
                style={{backgroundColor: bg}}
                onClick={onClick}
                disabled={disabled}
            >
                {label}
            </button>
        </>
    )
}
