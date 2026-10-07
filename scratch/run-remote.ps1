param (
    [Parameter(Mandatory=$true)]
    [string]$RemoteCommand
)

& gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="$RemoteCommand"
