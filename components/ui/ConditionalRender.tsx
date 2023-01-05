import { ReactElement } from "react"

interface ConditionalRenderProps {
  children?: ReactElement,
  condition: boolean
}

export default (props: ConditionalRenderProps) => {
  if (props.condition) {
    return (
      <>
        {props.children}
      </>
    )
  } else {
    return(
      <></>
    )
  }
}