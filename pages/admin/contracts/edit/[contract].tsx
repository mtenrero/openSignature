import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'

const EditContract = () => {
    const router = useRouter()
    const { contract } = router.query

    return <p>Contract: {contract}</p>
}

export default EditContract