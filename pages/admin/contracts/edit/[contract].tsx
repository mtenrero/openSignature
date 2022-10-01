import { LoadingOverlay, Title } from '@mantine/core'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import ContractForm from '../../../../components/contracts/ContractForm'

const EditContract = () => {
  const router = useRouter()
  const { contract } = router.query

  const [contractData, setContractData] = useState({})
  const [isLoading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/contracts/' + contract)
      .then((res) => res.json())
      .then((data) => {
        setContractData(data)
        setLoading(false)
      })
  }, [])

  if (isLoading) {
    return(
      <LoadingOverlay visible={isLoading}>
      </LoadingOverlay>

    )
  } else {
    return(
      <div>
        <Title order={1}>{"Editing contract: " + contractData["name"] || "Edit Contract"}</Title>
        <ContractForm previousValues={contractData}></ContractForm>
      </div>
    )
  }
}

export default EditContract