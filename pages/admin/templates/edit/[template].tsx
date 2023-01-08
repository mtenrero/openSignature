import { Title } from '@mantine/core'
import axios from 'axios'
import { useRouter } from 'next/router'
import ContractForm from '../../../../components/contracts/ContractForm'
import useSWR from 'swr'

const EditContract = () => {
  const router = useRouter()
  const { template } = router.query

  const fetcher = url => axios.get(url).then(res => res.data)
  const { data, error, isLoading } = useSWR(`/api/templates/${template}`, fetcher)

  if (error) return <div>Failed to load</div>
  if (isLoading) return <div>LOADING...</div>

  return(
    <div>
      <Title order={1}>{"Editing template: " + data["name"] || "Edit Template"}</Title>
      <ContractForm previousValues={data}></ContractForm>
    </div>
  )

}

export default EditContract