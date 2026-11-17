import avatarFemale from '../assets/team/avatar-female.png'
import iconGraduation from '../assets/team/icon-graduation.png'

const TEAM = [
  {
    name: 'Mashael Jameel Alshamari',
    role: 'Project Lead',
  },
  {
    name: 'Farah Saud Alshammari',
    role: 'Team Member',
  },
  {
    name: 'Ghaida Kanaan Altamimi',
    role: 'Team Member',
  },
  {
    name: 'Noura Abdulrahman Albagawi',
    role: 'Team Member',
  },
]

const SUPERVISION = [
  {
    name: 'Dr. Ali Alghubayshi',
    role: 'Project Supervisor',
    icon: iconGraduation,
    iconAlt: 'Graduation cap',
  },
  {
    name: 'Dr. Suad Alshammari',
    role: 'Co-Principal Investigator',
    icon: avatarFemale,
    iconAlt: 'Illustrated avatar',
  },
]

export function TeamSection() {
  return (
    <section className="team-section" id="team">
      <div className="team-inner">
        <p className="info-kicker">Our Team</p>
        <h2>Meet Our Team</h2>
        <p className="info-lead">
          The SCDAid student team and academic supervisors behind this
          prototype.
        </p>

        <ul className="team-grid">
          {TEAM.map((member) => (
            <li key={member.name} className="team-card">
              <div className="team-avatar team-avatar--member" aria-hidden="true">
                <img src={avatarFemale} alt="" />
              </div>
              <h3>{member.name}</h3>
              <p>{member.role}</p>
            </li>
          ))}
        </ul>

        <div className="supervision-block">
          <p className="supervision-label">Supervision</p>
          <ul className="supervision-grid">
            {SUPERVISION.map((person) => (
              <li key={person.name} className="supervision-card">
                <div className="team-avatar team-avatar--supervisor" aria-hidden="true">
                  <img src={person.icon} alt="" />
                </div>
                <div>
                  <h3>{person.name}</h3>
                  <p>{person.role}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
